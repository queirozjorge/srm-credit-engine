#!/usr/bin/env python3
"""End-to-end verification for the local Docker infrastructure."""

from __future__ import annotations

import base64
import hashlib
import html.parser
import http.cookiejar
import json
import os
import re
import secrets
import shlex
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / (".env" if (ROOT / ".env").exists() else ".env.example")
HTTPS_BASE = os.environ.get("SMOKE_HTTPS_BASE", "https://localhost:8443").rstrip("/")
HTTP_BASE = os.environ.get("SMOKE_HTTP_BASE", "http://localhost:8088").rstrip("/")
TLS_CONTEXT = ssl._create_unverified_context()
REQUEST_TIMEOUT = 20


class SmokeFailure(RuntimeError):
    pass


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


class LoginFormParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.forms = []
        self.current_form = None

    def handle_starttag(self, tag, attributes):
        values = dict(attributes)
        if tag == "form":
            self.current_form = {
                "id": values.get("id", ""),
                "action": values.get("action", ""),
                "method": values.get("method", "get").lower(),
                "fields": {},
            }
        elif tag == "input" and self.current_form is not None:
            name = values.get("name")
            if name:
                self.current_form["fields"][name] = values.get("value", "")

    def handle_endtag(self, tag):
        if tag == "form" and self.current_form is not None:
            self.forms.append(self.current_form)
            self.current_form = None


def read_environment(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        parsed = shlex.split(value, comments=False, posix=True)
        values[key] = parsed[0] if parsed else ""
    return values


ENV = read_environment(ENV_FILE)


def compose(*arguments: str, profile: str | None = None, timeout: int = 240,
            check: bool = True) -> subprocess.CompletedProcess[str]:
    command = ["docker", "compose", "--env-file", str(ENV_FILE)]
    if profile:
        command.extend(["--profile", profile])
    command.extend(arguments)
    result = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=timeout,
    )
    if check and result.returncode != 0:
        raise SmokeFailure(
            f"docker compose {' '.join(arguments)} falhou (código {result.returncode})"
        )
    return result


def opener(*, cookies: http.cookiejar.CookieJar | None = None,
           follow_redirects: bool = True) -> urllib.request.OpenerDirector:
    handlers: list[urllib.request.BaseHandler] = [
        urllib.request.HTTPSHandler(context=TLS_CONTEXT)
    ]
    if cookies is not None:
        handlers.append(urllib.request.HTTPCookieProcessor(cookies))
    if not follow_redirects:
        handlers.append(NoRedirectHandler())
    return urllib.request.build_opener(*handlers)


def request(url: str, *, method: str = "GET", body: bytes | None = None,
            headers: dict[str, str] | None = None, timeout: int = REQUEST_TIMEOUT,
            follow_redirects: bool = True,
            client: urllib.request.OpenerDirector | None = None
            ) -> tuple[int, object, bytes, str]:
    selected_opener = client or opener(follow_redirects=follow_redirects)
    outgoing = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    try:
        with selected_opener.open(outgoing, timeout=timeout) as response:
            return response.status, response.headers, response.read(), response.geturl()
    except urllib.error.HTTPError as response:
        return response.code, response.headers, response.read(), response.geturl()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SmokeFailure(message)


def passed(message: str) -> None:
    print(f"OK: {message}", flush=True)


def json_body(body: bytes, label: str) -> dict:
    try:
        return json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SmokeFailure(f"{label}: resposta não é JSON válido") from error


def test_http_redirect() -> None:
    status, headers, _, _ = request(
        f"{HTTP_BASE}/status?probe=task6", follow_redirects=False
    )
    require(status == 308, "HTTP deve responder 308")
    require(
        headers.get("Location") == f"{HTTPS_BASE}/status?probe=task6",
        "redirecionamento deve preservar caminho e query string",
    )
    passed("redirecionamento HTTP para HTTPS")


def test_frontend_and_assets() -> None:
    status, headers, body, _ = request(f"{HTTPS_BASE}/")
    page = body.decode("utf-8", errors="replace")
    require(status == 200 and 'id="root"' in page, "frontend não respondeu com a SPA")
    require("no-store" in headers.get("Cache-Control", ""), "index.html deve evitar cache")

    asset_match = re.search(r'(?:src|href)="(/assets/[^" ]+)"', page)
    require(asset_match is not None, "index.html não referencia assets do build")
    asset_status, asset_headers, _, _ = request(f"{HTTPS_BASE}{asset_match.group(1)}")
    cache_control = asset_headers.get("Cache-Control", "")
    require(asset_status == 200, "asset do frontend não foi servido")
    require("immutable" in cache_control, "asset com hash deve ter cache imutável")
    missing_status, _, missing_body, _ = request(f"{HTTPS_BASE}/assets/missing-smoke-asset.js")
    require(missing_status == 404 and b'id="root"' not in missing_body,
            "asset inexistente não deve usar fallback SPA")
    passed("frontend, headers de cache e asset versionado")


def test_api_and_actuator() -> None:
    compose("exec", "-T", "nginx", "nginx", "-t")
    status, headers, body, final_url = request(f"{HTTPS_BASE}/api/swagger-ui.html")
    require(status == 200, "Swagger do engine não respondeu")
    require("swagger-ui" in body.decode("utf-8", errors="replace").lower(),
            "Swagger UI não carregou atrás do prefixo /api")
    require("/api/" in urllib.parse.urlsplit(final_url).path,
            "redirects do Swagger devem manter o prefixo /api")

    config_status, _, config_body, _ = request(
        f"{HTTPS_BASE}/api/v3/api-docs/swagger-config"
    )
    require(config_status == 200, "Swagger config não respondeu através do proxy")
    swagger_config = json_body(config_body, "Swagger config")
    require("/api/" in swagger_config.get("url", ""),
            "URL OpenAPI do Swagger deve manter o prefixo /api")

    docs_status, docs_headers, docs_body, _ = request(f"{HTTPS_BASE}/api/v3/api-docs")
    require(docs_status == 200, "OpenAPI do engine não respondeu")
    require("no-store" in docs_headers.get("Cache-Control", ""),
            "respostas da API devem usar no-store")
    require("openapi" in json_body(docs_body, "OpenAPI"), "documento OpenAPI inválido")

    missing_api_status, _, missing_api_body, _ = request(f"{HTTPS_BASE}/api/missing-smoke-route")
    require(missing_api_status == 404 and b"<html" not in missing_api_body.lower(),
            "rota inexistente da API não deve usar fallback SPA")

    for path in ("/api/actuator/health", "/actuator/health"):
        blocked_status, _, blocked_body, _ = request(f"{HTTPS_BASE}{path}")
        require(blocked_status == 404, f"Actuator público não foi bloqueado: {path}")
        require("ROTA_INEXISTENTE" in blocked_body.decode("utf-8", errors="replace"),
                f"bloqueio do Actuator não retornou erro JSON: {path}")
    passed("Swagger atrás do proxy e Actuator bloqueado no Nginx")


def test_rate_limit() -> None:
    def get_response(_: int) -> tuple[int, object, bytes, str]:
        return request(f"{HTTPS_BASE}/api/rate-limit-probe")

    with ThreadPoolExecutor(max_workers=100) as pool:
        responses = list(pool.map(get_response, range(100)))
    rate_limited = next((response for response in responses if response[0] == 429), None)
    require(rate_limited is not None, "rajada não acionou o limite de requisições")
    payload = json_body(rate_limited[2], "resposta 429")
    require(payload.get("code") == "LIMITE_DE_REQUISICOES_EXCEDIDO",
            "429 deve usar o código JSON estável")
    passed("rate limiting e resposta JSON 429")
    time.sleep(4)


def test_request_body_limit() -> None:
    body = b"x" * (6 * 1024 * 1024 + 1)
    status, _, response, _ = request(
        f"{HTTPS_BASE}/api/body-limit-probe",
        method="POST",
        body=body,
        headers={"Content-Type": "application/octet-stream"},
        timeout=30,
    )
    payload = json_body(response, "resposta 413")
    require(status == 413, "Nginx deve recusar corpo acima de 6 MiB")
    require(payload.get("code") == "REQUISICAO_MUITO_GRANDE",
            "413 deve usar o código JSON estável")
    passed("limite de corpo e resposta JSON 413")


def test_keycloak_discovery_and_pkce() -> tuple[str, str, str]:
    public_base = ENV.get("KEYCLOAK_FRONTEND_URL", HTTPS_BASE).rstrip("/")
    realm = "srm-credit"
    client_id = "ui-r-credit"
    redirect_uri = f"{public_base}/"
    discovery_url = f"{public_base}/auth/realms/{realm}/.well-known/openid-configuration"
    status, _, discovery_body, _ = request(discovery_url)
    discovery = json_body(discovery_body, "discovery OIDC")
    expected_issuer = f"{public_base}/auth/realms/{realm}"
    require(status == 200 and discovery.get("issuer") == expected_issuer,
            "issuer do discovery OIDC não corresponde ao endereço HTTPS público")

    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode("ascii")).digest()
    ).rstrip(b"=").decode("ascii")
    state = secrets.token_urlsafe(24)
    authorization_query = urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid",
        "state": state,
        "nonce": secrets.token_urlsafe(24),
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    })
    authorization_url = f"{discovery['authorization_endpoint']}?{authorization_query}"
    cookie_jar = http.cookiejar.CookieJar()
    browser = opener(cookies=cookie_jar)
    login_status, _, login_page, login_url = request(
        authorization_url, client=browser
    )
    require(login_status == 200, "endpoint OIDC não apresentou login de demonstração")

    parser = LoginFormParser()
    parser.feed(login_page.decode("utf-8", errors="replace"))
    login_form = next((form for form in parser.forms if form["method"] == "post"
                       and "username" in form["fields"]), None)
    require(login_form is not None, "formulário de autenticação Keycloak não encontrado")

    credentials = dict(login_form["fields"])
    credentials["username"] = "operador"
    credentials["password"] = ENV.get("KEYCLOAK_OPERATOR_PASSWORD", "")
    require(bool(credentials["password"]), "senha de operador não configurada no env file")
    login_action = urllib.parse.urljoin(login_url, login_form["action"])
    def submit_form(action: str, fields: dict[str, str]) -> tuple[int, str]:
        form_request = urllib.request.Request(
            action,
            data=urllib.parse.urlencode(fields).encode("utf-8"),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with opener(cookies=cookie_jar, follow_redirects=False).open(
                    form_request, timeout=REQUEST_TIMEOUT) as response:
                return response.status, response.headers.get("Location", "")
        except urllib.error.HTTPError as response:
            return response.code, response.headers.get("Location", "")

    status, callback_location = submit_form(login_action, credentials)
    require(status in (302, 303) and callback_location,
            "login de demonstração não redirecionou ao callback OIDC")

    callback_url = urllib.parse.urljoin(login_action, callback_location)
    callback = urllib.parse.urlsplit(callback_url)
    callback_query = urllib.parse.parse_qs(callback.query)
    if callback.path.endswith("/login-actions/required-action"):
        profile_status, _, profile_page, profile_url = request(
            callback_url, client=browser
        )
        require(profile_status == 200,
                "Keycloak não apresentou o formulário para completar o perfil")
        profile_parser = LoginFormParser()
        profile_parser.feed(profile_page.decode("utf-8", errors="replace"))
        profile_form = next((form for form in profile_parser.forms
                             if {"firstName", "lastName", "email"} <= set(form["fields"])), None)
        require(profile_form is not None,
                "formulário de perfil obrigatório não contém os campos esperados")
        profile_fields = dict(profile_form["fields"])
        profile_fields.update({
            "firstName": "Operador",
            "lastName": "Demonstração",
            "email": "operador@srm-credit.local",
        })
        profile_action = urllib.parse.urljoin(profile_url, profile_form["action"])
        status, callback_location = submit_form(profile_action, profile_fields)
        require(status in (302, 303) and callback_location,
                "Keycloak não concluiu a atualização do perfil de demonstração")
        callback_url = urllib.parse.urljoin(profile_action, callback_location)
        callback = urllib.parse.urlsplit(callback_url)
        callback_query = urllib.parse.parse_qs(callback.query)

    code = callback_query.get("code", [""])[0]
    require(callback.scheme == "https" and callback.netloc == urllib.parse.urlsplit(redirect_uri).netloc,
            "callback OIDC saiu da origem HTTPS configurada")
    callback_state = callback_query.get("state", [""])[0]
    require(callback_state == state,
            "state retornado no callback OIDC não corresponde "
            f"(presente={bool(callback_state)}, chaves={sorted(callback_query)})")
    require(bool(code), "callback OIDC não retornou authorization code")

    token_form = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "client_id": client_id,
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": verifier,
    }).encode("utf-8")
    token_status, _, token_response_body, _ = request(
        discovery["token_endpoint"], method="POST",
        body=token_form,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    token_payload = json_body(token_response_body, "resposta de tokens")
    access_token = token_payload.get("access_token", "")
    require(token_status == 200 and token_payload.get("token_type", "").lower() == "bearer"
            and bool(access_token), "troca PKCE não retornou access token Bearer")
    passed("discovery OIDC e fluxo Authorization Code com PKCE S256")
    return code, access_token, credentials["password"]


def compose_exec(service: str, *arguments: str) -> str:
    result = compose("exec", "-T", service, *arguments)
    return result.stdout.strip()


def kafka_topics() -> set[str]:
    output = compose_exec(
        "kafka", "/opt/kafka/bin/kafka-topics.sh",
        "--bootstrap-server", "kafka:9092", "--list",
    )
    return set(output.splitlines())


def kafka_topic_ids(topics: set[str]) -> dict[str, str]:
    topic_ids = {}
    for topic in sorted(topics):
        output = compose_exec(
            "kafka", "/opt/kafka/bin/kafka-topics.sh",
            "--bootstrap-server", "kafka:9092", "--describe", "--topic", topic,
        )
        match = re.search(
            rf"Topic:\s+{re.escape(topic)}\s+TopicId:\s+([^\s]+)", output
        )
        require(match is not None, f"Kafka não retornou o identificador do tópico {topic}")
        topic_ids[topic] = match.group(1)
    return topic_ids


def test_persistent_volumes() -> None:
    database = ENV.get("POSTGRES_DB", "srm_credit")
    admin = ENV.get("POSTGRES_ADMIN_USER", "postgres")
    system_id_before = compose_exec(
        "postgres", "psql", "-Atq", "-U", admin, "-d", database,
        "-c", "SELECT system_identifier FROM pg_control_system()",
    )
    topics_before = kafka_topics()
    required_topics = {"credit-lot", "credit-lot.dlq"}
    require(required_topics <= topics_before,
            "tópicos esperados não existem no Kafka")
    topic_ids_before = kafka_topic_ids(required_topics)

    compose("down", "--remove-orphans")
    compose("up", "--detach", "--wait", "--wait-timeout", "240", timeout=300)

    system_id_after = compose_exec(
        "postgres", "psql", "-Atq", "-U", admin, "-d", database,
        "-c", "SELECT system_identifier FROM pg_control_system()",
    )
    require(system_id_before == system_id_after,
            "identificador do cluster PostgreSQL mudou após reinício da stack")
    topics_after = kafka_topics()
    require(required_topics <= topics_after,
            "tópicos Kafka não persistiram após reinício da stack")
    require(topic_ids_before == kafka_topic_ids(required_topics),
            "identificadores dos tópicos Kafka mudaram após reinício da stack")
    passed("volumes PostgreSQL e Kafka preservados após parar e subir a stack")


def test_proxy_recovery() -> None:
    compose("up", "--detach", "--force-recreate", "--wait", "--wait-timeout", "180",
            "spe-j-engine", "keycloak", timeout=240)
    time.sleep(11)

    swagger_status, _, _, _ = request(f"{HTTPS_BASE}/api/swagger-ui.html")
    discovery_status, _, _, _ = request(
        f"{HTTPS_BASE}/auth/realms/srm-credit/.well-known/openid-configuration"
    )
    require(swagger_status == 200 and discovery_status == 200,
            "Nginx não recuperou upstream após recriação de engine/Keycloak")
    passed("proxy recuperou após recriação de engine e Keycloak")


def test_temporary_upstream() -> None:
    compose("stop", "spe-j-engine")
    compose("rm", "--force", "--stop", "spe-j-engine")
    compose("up", "--build", "--detach", "--wait", "--wait-timeout", "60",
            "smoke-upstream", profile="smoke-test", timeout=120)
    time.sleep(11)

    marker = "smoke-only-bearer-secret"
    idempotency_key = "smoke-only-idempotency-key"
    request_body = b"body-sent-through-nginx"
    status, _, echoed_body, _ = request(
        f"{HTTPS_BASE}/api/smoke/echo?probe=task6",
        method="PATCH",
        body=request_body,
        headers={
            "Content-Type": "application/octet-stream",
            "Authorization": f"Bearer {marker}",
            "Idempotency-Key": idempotency_key,
            "X-Request-ID": "caller-controlled-id",
            "X-Forwarded-For": "203.0.113.9",
            "X-Forwarded-Proto": "http",
            "X-Forwarded-Port": "1234",
        },
    )
    echo = json_body(echoed_body, "upstream temporário")
    require(status == 201 and echo.get("method") == "PATCH",
            "Nginx não preservou método ou status do upstream")
    require(echo.get("path") == "/smoke/echo?probe=task6",
            "Nginx não removeu somente o prefixo /api")
    require(base64.b64decode(echo.get("body_base64", "")) == request_body,
            "Nginx não preservou o corpo da requisição")
    require(echo.get("authorization") == f"Bearer {marker}"
            and echo.get("idempotency_key") == idempotency_key,
            "Nginx não preservou cabeçalhos financeiros")
    require(echo.get("request_id") != "caller-controlled-id" and echo.get("request_id"),
            "Nginx não substituiu o identificador de correlação")
    require(echo.get("forwarded_proto") == "https"
            and echo.get("forwarded_port") == "8443",
            "Nginx encaminhou protocolo ou porta incorretos")
    require(echo.get("forwarded_host") == "localhost"
            and echo.get("forwarded_for") != "203.0.113.9"
            and echo.get("real_ip") != "203.0.113.9",
            "Nginx não substituiu os cabeçalhos de host e IP encaminhados")

    upstream_status, _, upstream_body, _ = request(
        f"{HTTPS_BASE}/api/smoke/echo?status=422", method="POST", body=b"status-check"
    )
    require(upstream_status == 422 and b"status=422" in upstream_body,
            "Nginx não preservou status e corpo de erro do upstream")

    compose("stop", "smoke-upstream", profile="smoke-test")
    compose("rm", "--force", "--stop", "smoke-upstream", profile="smoke-test")
    time.sleep(11)
    unavailable_status, _, unavailable_body, _ = request(f"{HTTPS_BASE}/api/unavailable-probe")
    unavailable = json_body(unavailable_body, "resposta 502")
    require(unavailable_status == 502 and unavailable.get("code") == "SERVICO_INDISPONIVEL",
            "falha de conexão ao upstream não retornou JSON 502")

    compose("up", "--build", "--detach", "--wait", "--wait-timeout", "60",
            "smoke-upstream", profile="smoke-test", timeout=120)
    time.sleep(11)
    timeout_status, _, timeout_body, _ = request(
        f"{HTTPS_BASE}/api/smoke/timeout", timeout=70
    )
    timed_out = json_body(timeout_body, "resposta 504")
    require(timeout_status == 504 and timed_out.get("code") == "TEMPO_LIMITE_EXCEDIDO",
            "timeout do upstream não retornou JSON 504")
    passed("proxy preserva método, corpo, headers e status; erros 502/504 em JSON")


def test_logs_do_not_leak(secrets_to_check: list[str],
                          services: tuple[str, ...] = ("nginx", "keycloak", "spe-j-engine")) -> None:
    logs = compose("logs", "--no-color", *services).stdout
    leaked = [secret for secret in secrets_to_check if secret and secret in logs]
    require(not leaked, "logs da infraestrutura contêm token, código ou credencial")
    passed("logs sem access token, authorization code ou credencial de teste")


def main() -> int:
    authorization_code = ""
    access_token = ""
    operator_password = ""
    try:
        compose("config", "--quiet")
        compose("down", "--remove-orphans")
        compose("up", "--build", "--detach", "--wait", "--wait-timeout", "600", timeout=900)
        test_http_redirect()
        test_frontend_and_assets()
        test_api_and_actuator()
        test_rate_limit()
        test_request_body_limit()
        authorization_code, access_token, operator_password = test_keycloak_discovery_and_pkce()
        test_logs_do_not_leak([authorization_code, access_token, operator_password])
        test_persistent_volumes()
        test_proxy_recovery()
        test_temporary_upstream()
        test_logs_do_not_leak(
            ["smoke-only-bearer-secret", "smoke-only-idempotency-key"],
            services=("nginx", "keycloak"),
        )
        passed("smoke test completo")
        return 0
    except (SmokeFailure, subprocess.TimeoutExpired, OSError) as error:
        print(f"FALHOU: {error}", file=sys.stderr, flush=True)
        return 1
    finally:
        compose("rm", "--force", "--stop", "smoke-upstream", profile="smoke-test", check=False)
        compose("up", "--detach", "--wait", "--wait-timeout", "180",
                "spe-j-engine", "keycloak", "nginx", timeout=240, check=False)


if __name__ == "__main__":
    raise SystemExit(main())

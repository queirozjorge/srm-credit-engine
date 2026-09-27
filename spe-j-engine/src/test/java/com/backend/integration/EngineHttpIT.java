package com.backend.integration;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
 "management.server.port=0","engine.outbox.enabled=false","spring.flyway.enabled=true",
 "spring.flyway.user=srm_migrator","spring.flyway.password=test",
 "spring.flyway.placeholders.engineRole=srm_engine","spring.flyway.placeholders.workflowRole=srm_workflow",
 "engine.security.issuer-uri=https://issuer.test","engine.security.audience=spe-j-engine"})
class EngineHttpIT {
 @Container static final PostgreSQLContainer DATABASE=new PostgreSQLContainer("postgres:17.11-trixie").withInitScript("db/test-roles.sql");
 static final JsonMapper JSON=JsonMapper.builder().build();
 static final AtomicInteger NEXT=new AtomicInteger(10);
 static final RSAKey KEY;
 static {
  try {KEY=new RSAKeyGenerator(2048).keyID("integration").generate();
  }catch(Exception e){throw new ExceptionInInitializerError(e);}
 }
 @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("spring.datasource.url",DATABASE::getJdbcUrl);r.add("spring.datasource.username",()->"srm_engine");r.add("spring.datasource.password",()->"test");}
 @LocalServerPort int port;
 @Autowired JdbcTemplate jdbc;
 final HttpClient client=HttpClient.newHttpClient();
 @TestConfiguration(proxyBeanMethods=false)
 static class TokenVerificationConfiguration {
  @Bean @Primary JwtDecoder integrationJwtDecoder() throws Exception {
   var decoder=NimbusJwtDecoder.withPublicKey(KEY.toRSAPublicKey()).signatureAlgorithm(SignatureAlgorithm.RS256).build();
   OAuth2TokenValidator<Jwt> identityAndAudience=jwt -> jwt.getAudience().contains("spe-j-engine")&&jwt.getSubject()!=null&&!jwt.getSubject().isBlank()&&jwt.getExpiresAt()!=null
     ? OAuth2TokenValidatorResult.success():OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
   decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer("https://issuer.test"),identityAndAudience));
   return decoder;
  }
 }
 record Response(int status,JsonNode body){}
 String token(String subject,String... roles)throws Exception{var claims=new JWTClaimsSet.Builder().issuer("https://issuer.test").subject(subject).audience("spe-j-engine").issueTime(new Date()).expirationTime(Date.from(Instant.now().plusSeconds(300))).claim("realm_access",Map.of("roles",roles)).build();var signed=new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("integration").build(),claims);signed.sign(new RSASSASigner(KEY));return signed.serialize();}
 Response request(String method,String path,Object body,String key,String token)throws Exception{
  var builder=HttpRequest.newBuilder(URI.create("http://localhost:"+port+path)).timeout(Duration.ofSeconds(30));
  if(token!=null)builder.header("Authorization","Bearer "+token);if(key!=null)builder.header("Idempotency-Key",key);
  if(body!=null)builder.header("Content-Type","application/json");
  builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)));
  var response=client.send(builder.build(),HttpResponse.BodyHandlers.ofString());return new Response(response.statusCode(),response.body().isEmpty()?JSON.nullNode():JSON.readTree(response.body()));
 }
 Response call(String method,String path,Object body,String key)throws Exception{return request(method,path,body,key,token("operator","OPERADOR"));}
 String assignor()throws Exception{var document=String.format("%012d",NEXT.incrementAndGet());for(int count=12;count<14;count++){int sum=0,weight=2;for(int i=count-1;i>=0;i--){sum+=(document.charAt(i)-'0')*weight;weight=weight==9?2:weight+1;}document+=sum%11<2?0:11-sum%11;}
  var response=call("POST","/assignors",Map.of("name","Cedente de teste","documentNumber",document),null);assertEquals(201,response.status,response.body.toString());return response.body.path("uuid").asString();}
 Map<String,Object> item(String assignor,String currency){return Map.of("assignorUuid",assignor,"externalReference",UUID.randomUUID().toString(),"type","DUPLICATA_MERCANTIL","faceValueBrl","1000.00","dueDate",LocalDate.now(ZoneId.of("America/Sao_Paulo")).plusDays(30).toString(),"paymentCurrency",currency);}
 String batch(String... currencies)throws Exception{var assignor=assignor();var items=Arrays.stream(currencies).map(c->item(assignor,c)).toList();var created=call("POST","/batches",Map.of("items",items),null);assertEquals(201,created.status,created.body.toString());return created.body.path("uuid").asString();}
 @Test void partialAcceptanceAndReplayPersistExactlyOneRequest()throws Exception{
  var batch=batch("BRL","USD");var key=UUID.randomUUID().toString();var path="/batches/"+batch+"/settlements";
  assertEquals(0,jdbc.queryForObject("select count(*) from outbox_message where batch_uuid=?",Integer.class,UUID.fromString(batch)));
  var accepted=call("POST",path,null,key);assertEquals(202,accepted.status,accepted.body.toString());assertEquals(1,accepted.body.path("counts").path("pending").asInt());assertEquals(1,accepted.body.path("counts").path("failed").asInt());
  var replay=call("POST",path,null,key);assertEquals(202,replay.status,replay.body.toString());assertEquals(accepted.body.path("uuid"),replay.body.path("uuid"));
  var conflict=call("POST",path,null,UUID.randomUUID().toString());assertEquals(409,conflict.status);assertEquals("LOTE_EM_PROCESSAMENTO",conflict.body.path("code").asString());
  assertEquals(1,jdbc.queryForObject("select count(*) from outbox_message where batch_uuid=?",Integer.class,UUID.fromString(batch)));
  for(var endpoint:List.of("/batches/"+batch,"/batches/"+batch+"/receivables","/batches/"+batch+"/settlements","/batches/"+batch+"/audit-events","/settlement-requests/"+accepted.body.path("uuid").asString()+"/items","/dashboard","/settlements/items")){var result=call("GET",endpoint,null,null);assertEquals(200,result.status,endpoint+result.body);}
 }
 @Test void allRejectedCommitAndReprocessCreatesNewAttempt()throws Exception{
  var batch=batch("USD");var path="/batches/"+batch+"/settlements";var key=UUID.randomUUID().toString();
  var rejected=call("POST",path,null,key);assertEquals(422,rejected.status,rejected.body.toString());assertEquals("NENHUM_TITULO_APTO",rejected.body.path("code").asString());assertEquals(rejected.body,call("POST",path,null,key).body);
  var items=call("GET","/batches/"+batch+"/receivables",null,null);var id=items.body.path("items").get(0).path("uuid").asString();
  var retried=call("POST",path,Map.of("receivableUuids",List.of(id),"reason","Nova análise"),UUID.randomUUID().toString());assertEquals(422,retried.status,retried.body.toString());
  assertNotEquals(rejected.body.path("context").path("requestUuid"),retried.body.path("context").path("requestUuid"));
  assertEquals(2,jdbc.queryForObject("select count(*) from settlement_request_item where receivable_uuid=?",Integer.class,UUID.fromString(id)));
  assertEquals(0,jdbc.queryForObject("select count(*) from outbox_message where batch_uuid=?",Integer.class,UUID.fromString(batch)));
 }
 @Test void concurrentKeysAndDuplicateIdentityCannotCreateDuplicateEffects()throws Exception{
  var batch=batch("BRL");var path="/batches/"+batch+"/settlements";var key=UUID.randomUUID().toString();var auth=token("operator","OPERADOR");
  try(var pool=Executors.newFixedThreadPool(4)){var work=new ArrayList<Callable<Response>>();for(int i=0;i<4;i++)work.add(()->request("POST",path,null,key,auth));for(var future:pool.invokeAll(work)){var result=future.get();assertEquals(202,result.status,result.body.toString());}}
  assertEquals(1,jdbc.queryForObject("select count(*) from settlement_request where batch_uuid=?",Integer.class,UUID.fromString(batch)));
  var assignor=assignor();var repeated=item(assignor,"BRL");assertEquals(201,call("POST","/batches",Map.of("items",List.of(repeated)),null).status);var duplicate=call("POST","/batches",Map.of("items",List.of(repeated)),null);assertEquals(409,duplicate.status,duplicate.body.toString());assertEquals("RECEBIVEL_DUPLICADO",duplicate.body.path("code").asString());
 }
 @Test void authenticationPermissionsAndStrictTransportAreEnforced()throws Exception{
  assertEquals(401,request("GET","/batches",null,null,null).status);assertEquals(403,request("POST","/batches",Map.of("items",List.of()),null,token("manager","GESTOR")).status);
  assertEquals(404,call("GET","/missing-route",null,null).status);
  var assignor=assignor();var malformed=new HashMap<>(item(assignor,"BRL"));malformed.put("faceValueBrl",1000);
  assertEquals(400,call("POST","/batches",Map.of("items",List.of(malformed)),null).status);
  assertEquals(400,call("POST","/batches",Map.of("items",List.of(item(assignor,"BRL")),"source","CSV"),null).status);
  assertEquals(400,call("GET","/assignors?page=0",null,null).status);
  var current=call("GET","/assignors/"+assignor,null,null);assertEquals(204,call("PATCH","/assignors/"+assignor,Map.of("name","Novo nome","version",current.body.path("version").asString()),null).status);
  assertEquals(409,call("PATCH","/assignors/"+assignor,Map.of("name","Conflito","version",current.body.path("version").asString()),null).status);
 }
}

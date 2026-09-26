FROM alpine:3.24.2

RUN apk add --no-cache openssl

COPY generate-local-certificate.sh /usr/local/bin/generate-local-certificate
RUN chmod 0755 /usr/local/bin/generate-local-certificate

ENTRYPOINT ["/usr/local/bin/generate-local-certificate"]

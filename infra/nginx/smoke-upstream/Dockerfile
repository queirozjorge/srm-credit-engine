FROM alpine:3.24.2

RUN apk add --no-cache python3 \
    && adduser -D -u 10001 smoke

WORKDIR /app
COPY server.py ./server.py

USER smoke
EXPOSE 8080

ENTRYPOINT ["python3", "/app/server.py"]

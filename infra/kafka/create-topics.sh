#!/bin/sh
set -eu

bootstrap_servers="${KAFKA_BOOTSTRAP_SERVERS:-kafka:9092}"

for topic in credit-lot credit-lot.dlq; do
    /opt/kafka/bin/kafka-topics.sh \
        --bootstrap-server "$bootstrap_servers" \
        --create \
        --if-not-exists \
        --topic "$topic" \
        --partitions 3 \
        --replication-factor 1
done

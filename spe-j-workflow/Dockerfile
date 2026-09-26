FROM eclipse-temurin:21.0.12_8-jdk-noble AS build

WORKDIR /workspace

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -B --no-transfer-progress dependency:go-offline

COPY src/ src/
RUN ./mvnw -B --no-transfer-progress package

FROM eclipse-temurin:21.0.12_8-jre-noble

WORKDIR /app

RUN groupadd --system spring && useradd --system --gid spring --home-dir /app spring
COPY --from=build --chown=spring:spring /workspace/target/spe-j-workflow-*.jar /app/app.jar

USER spring:spring
EXPOSE 18081 18082

ENTRYPOINT ["java", "-jar", "/app/app.jar"]

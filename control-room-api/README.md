# AEGIS Control Room API

Spring Boot backend for the converted AEGIS Command control-room website.

## Run

```sh
mvn spring-boot:run
```

The API listens on `http://localhost:8082`.

Endpoints:

- `GET /api/control-room/snapshot`
- `POST /api/control-room/reset`
- `POST /api/control-room/tick`
- `POST /api/control-room/assign`

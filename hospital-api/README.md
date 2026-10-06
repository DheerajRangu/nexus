# AEGIS Hospital API

Spring Boot backend for the converted hospital operations website.

## Run

```sh
mvn spring-boot:run
```

The API listens on `http://localhost:8081` and exposes hospital operations under:

```text
/api/hospital
```

Useful endpoints:

- `GET /api/hospital/overview`
- `POST /api/hospital/reset`
- `POST /api/hospital/requests/{id}/accept`
- `POST /api/hospital/requests/{id}/decline`
- `PUT /api/hospital/beds/{id}`
- `PUT /api/hospital/equipment/{id}`
- `PUT /api/hospital/specialists/{id}`

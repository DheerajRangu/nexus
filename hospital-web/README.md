# AEGIS Hospital Web

React/Vite conversion of the hospital operations website. It talks to the Spring Boot API in `../hospital-api`.

## Run

Start the backend first:

```sh
cd ../hospital-api
mvn spring-boot:run
```

Then run the React app:

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5174`.

Set `VITE_HOSPITAL_API` if the backend is not at the default:

```sh
VITE_HOSPITAL_API=http://localhost:8081/api/hospital npm run dev
```

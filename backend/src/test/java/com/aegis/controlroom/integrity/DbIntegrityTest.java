package com.aegis.controlroom.integrity;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertThrows;

class DbIntegrityTest {

    private static String url;
    private static String user;
    private static String password;

    @BeforeAll
    static void migrate() {
        url = System.getenv().getOrDefault("DB_URL", "jdbc:postgresql://localhost:5432/aegis").replace("/aegis", "/aegis_test");
        user = System.getenv().getOrDefault("DB_USER", "aegis_app");
        password = System.getenv("DB_PASSWORD");
        if (password == null || password.isBlank()) {
            throw new IllegalStateException("DB_PASSWORD is not set");
        }
        Flyway.configure()
                .dataSource(url, user, password)
                .locations("classpath:db/migration")
                .load()
                .migrate();
    }

    @Test
    void duplicateActiveAssignment_isRejectedByDatabase() throws Exception {
        try (Connection c = open(); Statement s = c.createStatement()) {
            s.executeUpdate("DELETE FROM missions WHERE mission_id LIKE 'm-int-%'");
            s.executeUpdate("DELETE FROM emergency_cases WHERE emergency_id LIKE 'emg-int-%'");
            s.executeUpdate("DELETE FROM ambulances WHERE ambulance_id = 'amb-int-1'");
            s.executeUpdate("DELETE FROM users WHERE user_id = 'usr-int-1'");
            s.executeUpdate("""
                    INSERT INTO users (user_id, username, password_hash, full_name, role)
                    VALUES ('usr-int-1', 'usr-int-1', 'x', 'Integrity', 'ROLE_DRIVER')
                    """);
            s.executeUpdate("""
                    INSERT INTO ambulances (ambulance_id, license_plate, capability_tier, latitude, longitude)
                    VALUES ('amb-int-1', 'INT-1', 'BLS', 12.97, 77.59)
                    """);
            s.executeUpdate("""
                    INSERT INTO emergency_cases (emergency_id, callback_number)
                    VALUES ('emg-int-1', '9000000001'), ('emg-int-2', '9000000002')
                    """);
            s.executeUpdate("""
                    INSERT INTO missions (mission_id, emergency_id, ambulance_id, driver_id, current_state)
                    VALUES ('m-int-1', 'emg-int-1', 'amb-int-1', 'usr-int-1', 'ASSIGNED')
                    """);
            assertThrows(SQLException.class, () -> s.executeUpdate("""
                    INSERT INTO missions (mission_id, emergency_id, ambulance_id, driver_id, current_state)
                    VALUES ('m-int-2', 'emg-int-2', 'amb-int-1', 'usr-int-1', 'ASSIGNED')
                    """));
        }
    }

    @Test
    void overReservation_isRejectedByDatabase() throws Exception {
        try (Connection c = open(); Statement s = c.createStatement()) {
            s.executeUpdate("DELETE FROM hospitals WHERE hospital_id = 'hosp-int-1'");
            s.executeUpdate("""
                    INSERT INTO hospitals (hospital_id, name, latitude, longitude, available_beds, reserved_beds)
                    VALUES ('hosp-int-1', 'Integrity', 12.97, 77.59, 1, 0)
                    """);
            assertThrows(SQLException.class, () -> s.executeUpdate(
                    "UPDATE hospitals SET reserved_beds = 2 WHERE hospital_id = 'hosp-int-1'"));
        }
    }

    private static Connection open() throws SQLException {
        return DriverManager.getConnection(url, user, password);
    }
}

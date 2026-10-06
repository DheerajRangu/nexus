package com.aegis.controlroom.demo;

import com.aegis.controlroom.model.Role;
import com.aegis.controlroom.model.User;
import com.aegis.controlroom.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * DEMO ONLY. Applies demo login users when profile {@code demo} is active.
 * Credentials are not operational secrets; password for all rows is {@code password}.
 * Flyway schema migrations must not be treated as the source of demo passwords.
 */
@Component
@Profile("demo")
public class DemoUserSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoUserSeeder.class);

    private final UserRepository users;
    private final PasswordEncoder encoder;

    public DemoUserSeeder(UserRepository users, PasswordEncoder encoder) {
        this.users = users;
        this.encoder = encoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        String hash = encoder.encode("password");
        upsert("usr-sup-01", "supervisor1", "Sarah Jenkins (Supervisor)", Role.ROLE_SUPERVISOR, null, hash);
        upsert("usr-op-01", "operator1", "David Miller (Call Intake)", Role.ROLE_OPERATOR, null, hash);
        upsert("usr-drv-01", "driver1", "Rajesh Kumar (ALS Driver)", Role.ROLE_DRIVER, "AMB-108-NORTH-01", hash);
        upsert("usr-drv-02", "driver2", "Vikram Singh (BLS Driver)", Role.ROLE_DRIVER, "AMB-108-CENTRAL-02", hash);
        upsert("usr-hosp-01", "hospadmin1", "Dr. Aris Mehta (ER Director)", Role.ROLE_HOSPITAL_STAFF, "HOSP-CITY-GENERAL-01", hash);
        log.info("DEMO ONLY: demo users upserted (password=password)");
    }

    private void upsert(String id, String username, String fullName, Role role, String scope, String hash) {
        User u = users.findById(id).orElseGet(User::new);
        u.setUserId(id);
        u.setUsername(username);
        u.setFullName(fullName);
        u.setRole(role);
        u.setEntityScopeId(scope);
        u.setPasswordHash(hash);
        users.save(u);
    }
}

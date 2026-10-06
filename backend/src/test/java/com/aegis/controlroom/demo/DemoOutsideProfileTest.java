package com.aegis.controlroom.demo;

import com.aegis.controlroom.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Without the {@code demo} profile, demo endpoints must not be mapped (404),
 * or auth may reject first (401/403). Spec allows 404/403.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DemoOutsideProfileTest {

    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;

    @Test
    void demoReset_withoutDemoProfile_returns404() throws Exception {
        String token = jwt.issue("usr-op-01", "ROLE_OPERATOR", null);
        mvc.perform(post("/api/v1/demo/reset")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound());
    }

    @Test
    void demoRunScenario_withoutDemoProfile_returns404() throws Exception {
        String token = jwt.issue("usr-op-01", "ROLE_OPERATOR", null);
        mvc.perform(post("/api/v1/demo/run-scenario")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound());
    }
}

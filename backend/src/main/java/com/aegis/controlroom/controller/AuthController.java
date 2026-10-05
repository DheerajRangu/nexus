package com.aegis.controlroom.controller;

import com.aegis.controlroom.model.User;
import com.aegis.controlroom.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final UserRepository userRepository;

    public AuthController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, String> credentials) {
        String username = credentials.get("username");
        User user = userRepository.findByUsername(username).orElse(null);

        if (user == null) {
            // Default demo fallback user if username unknown
            User demoUser = new User();
            demoUser.setUserId("usr-demo");
            demoUser.setUsername(username != null ? username : "supervisor1");
            demoUser.setFullName("Demo Operations Lead");
            demoUser.setRole(com.aegis.controlroom.model.Role.ROLE_SUPERVISOR);
            user = demoUser;
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("token", "aegis_jwt_demo_token_" + user.getUserId());
        resp.put("userId", user.getUserId());
        resp.put("username", user.getUsername());
        resp.put("fullName", user.getFullName());
        resp.put("role", user.getRole().name());
        resp.put("entityScopeId", user.getEntityScopeId());

        return ResponseEntity.ok(resp);
    }
}

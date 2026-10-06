package com.aegis.dispatch.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {
  @Bean PasswordEncoder passwordEncoder(){return PasswordEncoderFactories.createDelegatingPasswordEncoder();}
  @Bean UserDetailsService users(PasswordEncoder encoder, @Value("${aegis.auth.operator-password}") String operatorPassword, @Value("${aegis.auth.driver-password}") String driverPassword) {
    return new InMemoryUserDetailsManager(
      User.withUsername("operator").password(encoder.encode(operatorPassword)).roles("OPERATOR").build(),
      User.withUsername("admin").password(encoder.encode(operatorPassword)).roles("ADMIN","OPERATOR").build(),
      User.withUsername("driver-a").password(encoder.encode(driverPassword)).roles("DRIVER").build(),
      User.withUsername("driver-b").password(encoder.encode(driverPassword)).roles("DRIVER").build(),
      User.withUsername("driver-c").password(encoder.encode(driverPassword)).roles("DRIVER").build()
    );
  }
  @Bean SecurityFilterChain security(HttpSecurity http) throws Exception {
    return http.csrf(csrf->csrf.disable()).cors(Customizer.withDefaults()).httpBasic(Customizer.withDefaults())
      .authorizeHttpRequests(a->a.requestMatchers("/actuator/health","/api/v1/contracts/**").permitAll()
        .requestMatchers("/api/v1/driver/**").hasRole("DRIVER")
        .requestMatchers("/api/v1/control-room/**","/api/v1/demo/**").hasAnyRole("OPERATOR","ADMIN")
        .requestMatchers("/ws/**").authenticated().anyRequest().authenticated()).build();
  }
}

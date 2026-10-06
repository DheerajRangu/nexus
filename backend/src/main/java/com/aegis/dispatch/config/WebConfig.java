package com.aegis.dispatch.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.web.cors.*;
import java.util.List;

@Configuration
public class WebConfig {
  @Bean CorsConfigurationSource corsConfigurationSource(@Value("${aegis.allowed-origin}") String origin){
    var c=new CorsConfiguration();c.setAllowedOrigins(List.of(origin));c.setAllowedMethods(List.of("GET","POST","OPTIONS"));c.setAllowedHeaders(List.of("Authorization","Content-Type","Idempotency-Key"));var s=new UrlBasedCorsConfigurationSource();s.registerCorsConfiguration("/**",c);return s;
  }
}

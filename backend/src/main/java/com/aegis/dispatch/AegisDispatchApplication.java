package com.aegis.dispatch;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class AegisDispatchApplication {
  public static void main(String[] args) { SpringApplication.run(AegisDispatchApplication.class, args); }
}

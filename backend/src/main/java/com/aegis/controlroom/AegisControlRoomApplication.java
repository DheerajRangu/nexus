package com.aegis.controlroom;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class AegisControlRoomApplication {
    public static void main(String[] args) {
        SpringApplication.run(AegisControlRoomApplication.class, args);
    }
}

package com.aegis.controlroom.controller;

import com.aegis.controlroom.model.SmsOutbox;
import com.aegis.controlroom.repository.SmsOutboxRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/notifications/sms")
public class SmsOutboxController {
    private final SmsOutboxRepository repository;

    public SmsOutboxController(SmsOutboxRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('SUPERVISOR','OPERATOR')")
    public List<SmsOutbox> listOutbox() {
        return repository.findAll();
    }
}

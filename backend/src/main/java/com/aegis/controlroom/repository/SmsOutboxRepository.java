package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.SmsOutbox;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SmsOutboxRepository extends JpaRepository<SmsOutbox, String> {
}

package com.aegis.controlroom.service;

import com.aegis.controlroom.model.SmsOutbox;
import com.aegis.controlroom.repository.SmsOutboxRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

@Service
public class SmsOutboxService {
    private final SmsOutboxRepository smsOutboxRepository;
    private final WebSocketNotificationService webSocketNotificationService;

    public SmsOutboxService(SmsOutboxRepository smsOutboxRepository, WebSocketNotificationService webSocketNotificationService) {
        this.smsOutboxRepository = smsOutboxRepository;
        this.webSocketNotificationService = webSocketNotificationService;
    }

    public SmsOutbox sendSms(String phone, String text) {
        SmsOutbox outbox = new SmsOutbox();
        outbox.setOutboxId("sms-" + UUID.randomUUID().toString().substring(0, 8));
        outbox.setRecipientPhone(phone);
        outbox.setMessageText(text);

        // Demo mode: Simulate delivery failure for test numbers starting with +91-9000
        if (phone.startsWith("+91-9000")) {
            outbox.setStatus("FAILED");
            outbox.setFailureReason("Provider Error 402: Carrier unreachable / Invalid phone number format");
        } else {
            outbox.setStatus("SENT");
            outbox.setSentAt(Instant.now());
        }

        SmsOutbox saved = smsOutboxRepository.save(outbox);
        webSocketNotificationService.broadcastEvent("/topic/sms", "SMS_OUTBOX_UPDATED", saved.getOutboxId(), saved);
        return saved;
    }
}

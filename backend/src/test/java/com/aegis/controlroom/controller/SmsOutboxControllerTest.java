package com.aegis.controlroom.controller;

import com.aegis.controlroom.model.SmsOutbox;
import com.aegis.controlroom.repository.SmsOutboxRepository;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.*;

class SmsOutboxControllerTest {
    @Test
    void returnsPersistedOutboxRows() {
        SmsOutboxRepository repository = mock(SmsOutboxRepository.class);
        List<SmsOutbox> rows = List.of(new SmsOutbox());
        when(repository.findAll()).thenReturn(rows);

        List<SmsOutbox> response = new SmsOutboxController(repository).listOutbox();

        assertSame(rows, response);
        verify(repository).findAll();
    }
}

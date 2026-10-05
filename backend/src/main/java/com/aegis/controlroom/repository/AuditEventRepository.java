package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.AuditEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface AuditEventRepository extends JpaRepository<AuditEvent, String> {
    List<AuditEvent> findByAggregateId(String aggregateId);
}

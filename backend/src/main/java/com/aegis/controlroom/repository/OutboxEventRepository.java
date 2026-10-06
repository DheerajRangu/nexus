package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.OutboxEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, String> {
    List<OutboxEvent> findByPublishedFalseOrderByOccurredAtAsc();
    List<OutboxEvent> findByAggregateIdOrderByEntityVersionAsc(String aggregateId);
}

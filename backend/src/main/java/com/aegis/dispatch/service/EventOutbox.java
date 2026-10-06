package com.aegis.dispatch.service;

import com.aegis.dispatch.api.ApiModels.EventEnvelope;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.time.Instant;
import java.util.UUID;

@Component
public class EventOutbox {
  private final JdbcTemplate jdbc; private final ObjectMapper json; private final SimpMessagingTemplate broker;
  public EventOutbox(JdbcTemplate jdbc,ObjectMapper json,SimpMessagingTemplate broker){this.jdbc=jdbc;this.json=json;this.broker=broker;}
  public void append(String aggregateType,String aggregateId,String type,long version,Object payload){
    var event=new EventEnvelope(UUID.randomUUID().toString(),type,"v1",version,Instant.now(),payload);
    try { jdbc.update("INSERT INTO event_outbox(id,aggregate_type,aggregate_id,event_type,schema_version,entity_version,payload,occurred_at) VALUES (?,?,?,?,?,?,CAST(? AS jsonb),?)", UUID.fromString(event.eventId()),aggregateType,aggregateId,type,"v1",version,json.writeValueAsString(payload),event.occurredAt()); }
    catch(JsonProcessingException e){throw new IllegalStateException("Could not serialize event",e);}
    Runnable publish=()->broker.convertAndSend("/topic/aegis."+aggregateType+"."+aggregateId,event);
    if(TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCommit(){publish.run();}}); else publish.run();
  }
  public void audit(String actor,String role,String action,UUID missionId,UUID assignmentId,Object detail){
    try {jdbc.update("INSERT INTO audit_log(id,actor,actor_role,action,mission_id,assignment_id,detail,occurred_at) VALUES (?,?,?,?,?,?,CAST(? AS jsonb),?)",UUID.randomUUID(),actor,role,action,missionId,assignmentId,json.writeValueAsString(detail),Instant.now());}
    catch(JsonProcessingException e){throw new IllegalStateException(e);}
  }
}

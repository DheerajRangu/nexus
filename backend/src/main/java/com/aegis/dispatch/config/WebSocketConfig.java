package com.aegis.dispatch.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
  private final String origin; public WebSocketConfig(@Value("${aegis.allowed-origin}") String origin){this.origin=origin;}
  @Override public void configureMessageBroker(MessageBrokerRegistry registry){registry.enableSimpleBroker("/topic","/user");registry.setApplicationDestinationPrefixes("/app");}
  @Override public void registerStompEndpoints(StompEndpointRegistry registry){registry.addEndpoint("/ws").setAllowedOriginPatterns(origin);}
}

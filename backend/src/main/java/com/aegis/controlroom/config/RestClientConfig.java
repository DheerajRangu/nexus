package com.aegis.controlroom.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.JdkClientHttpRequestFactory;

import java.net.http.HttpClient;
import java.time.Duration;

@Configuration
public class RestClientConfig {

    @Bean
    public RestTemplate aiRestTemplate(
            RestTemplateBuilder builder,
            @Value("${aegis.ai-service.connect-timeout-ms:800}") long connectMs,
            @Value("${aegis.ai-service.read-timeout-ms:1500}") long readMs) {
        return builder
                .setConnectTimeout(Duration.ofMillis(connectMs))
                .setReadTimeout(Duration.ofMillis(readMs))
                .build();
    }

    @Bean("googleRoutesRestClient")
    public RestClient googleRoutesRestClient(
            @Value("${aegis.routing.connect-timeout-ms:1000}") long connectMs,
            @Value("${aegis.routing.read-timeout-ms:3000}") long readMs) {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(connectMs))
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofMillis(readMs));
        return RestClient.builder().requestFactory(requestFactory).build();
    }
}

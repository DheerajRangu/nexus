package com.aegis.controlroom.dto;

public class OfferResponseDto {
    private String action; // ACCEPT or DECLINE

    public OfferResponseDto() {}

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
}

package com.aegis.controlroom.demo;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("demo")
public class DemoInjectionStore {
    private volatile DemoInjection pending = DemoInjection.NONE;

    public void set(DemoInjection injection) {
        this.pending = injection == null ? DemoInjection.NONE : injection;
    }

    public DemoInjection consume() {
        DemoInjection current = pending;
        pending = DemoInjection.NONE;
        return current;
    }

    public DemoInjection peek() {
        return pending;
    }
}

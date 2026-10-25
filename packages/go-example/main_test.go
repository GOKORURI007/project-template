package main

import "testing"

func TestCustomGreeting(t *testing.T) {
	if got := greeting("workspace"); got != "Hello from workspace" {
		t.Fatalf("unexpected greeting: %s", got)
	}
}

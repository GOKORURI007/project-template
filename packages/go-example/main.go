package main

import "fmt"

func greeting(name string) string {
	return "Hello from " + name
}

func main() {
	fmt.Println(greeting("Go"))
}

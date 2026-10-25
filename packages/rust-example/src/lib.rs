pub fn greeting(name: &str) -> String {
    format!("Hello from {name}")
}

#[cfg(test)]
mod tests {
    use super::greeting;

    #[test]
    fn custom_greeting() {
        assert_eq!(greeting("workspace"), "Hello from workspace");
    }
}

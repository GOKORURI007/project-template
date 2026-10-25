from python_example import greeting


def test_custom_greeting() -> None:
    assert greeting("workspace") == "Hello from workspace"

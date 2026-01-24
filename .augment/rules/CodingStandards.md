---
type: "manual"
---

# **Coding Standards & Style Guide**

## **1\. Naming Conventions**

* **Clarity over Brevity:** Variable names should be descriptive. user\_id is better than uid. calculate\_total\_revenue() is better than calc().
* **Booleans:** Boolean variables and functions should strictly use is, has, can, or should prefixes (e.g., is\_visible, has\_permission).
* **Consistency:** Follow the language's standard guide (PEP8 for Python, Airbnb for JS/TS, Go fmt for Go).

## **2\. Comments & Documentation**

* **The "Why", Not the "What":** Do not write comments that describe what the code is doing (the code speaks for itself). Write comments explaining *why* a specific approach was chosen.
* **Docstrings:** Public functions and classes MUST have docstrings describing inputs, outputs, and potential exceptions.
* **TODOs:** If a solution is temporary, mark it with TODO: \[Explanation\] and suggested future improvements.

## **3\. Error Handling**

* **No Silent Failures:** Never use empty try/catch or except: pass blocks. Always log the error or re-throw it.
* **Specific Exceptions:** Catch specific exceptions (e.g., ValueError, NetworkError) rather than generic Exception or Error.
* **Graceful Degradation:** The application should not crash completely due to a minor feature failure.

## **4\. Modern Practices**

* **Functional over Imperative:** Prefer map/filter/reduce (or list comprehensions) over raw loops where readability is not compromised.
* **Immutability:** Prefer const (JS/TS) or immutable data structures where possible to avoid side effects.
* **Async/Await:** Use modern async/await syntax instead of callbacks or raw promises.

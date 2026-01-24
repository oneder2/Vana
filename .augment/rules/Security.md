---
type: "manual"
description: "Example description"
---

# **Security & Performance Guidelines**

## **1\. Security First**

* **Input Validation:** NEVER trust user input. Validate and sanitize all inputs at the API boundary.
* **SQL Injection:** Always use parameterized queries or ORMs. Never use string concatenation for SQL.
* **XSS Prevention:** Escape all user-generated content before rendering it in the browser.
* **Secrets:** NEVER hardcode API keys, passwords, or tokens in the code. Use .env files.

## **2\. Performance Optimization**

* **Big O Notation:** Be mindful of algorithmic complexity. Avoid nested loops (O(n^2)) on large datasets.
* **Database Queries:** Avoid "N+1" query problems. Use batch fetching or joins.
* **Memory Management:** Clean up event listeners, timers, and large objects when they are no longer needed to prevent memory leaks.
* **Lazy Loading:** Load heavy modules or components only when they are needed.

## **3\. Library Usage**

* **Minimal Dependencies:** Do not import a heavy library just for a single utility function that can be easily written in native code.
* **Audit:** Prefer well-maintained, popular libraries with no known critical vulnerabilities.
~                                                                                                 
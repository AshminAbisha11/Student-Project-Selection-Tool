import { http, HttpResponse } from "msw";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

export const handlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    const { email, password } = await request.json();
    if (email === "ok@aston.ac.uk" && password === "secret") {
      return HttpResponse.json({ token: "jwt-token", user: { id: 1, role: "student" } });
    }
    return new HttpResponse(JSON.stringify({ message: "Invalid credentials" }), { status: 401 });
  }),
];

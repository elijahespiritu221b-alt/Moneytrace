import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const Ctx = createContext(null);

export function CitizenProvider({ children }) {
  const [citizen, setCitizen] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.get("/citizen/me").then((r) => setCitizen(r.data)).catch(() => setCitizen(null)).finally(() => setReady(true));
  }, []);

  const register = async (body) => { const { data } = await api.post("/citizen/register", body); setCitizen(data); return data; };
  const login = async (email, password) => { const { data } = await api.post("/citizen/login", { email, password }); setCitizen(data); return data; };
  const verify = async (code) => { const { data } = await api.post("/citizen/verify-phone", { code }); setCitizen(data); return data; };
  const resend = async () => (await api.post("/citizen/resend-otp")).data;
  const logout = async () => { await api.post("/citizen/logout"); setCitizen(null); };

  return <Ctx.Provider value={{ citizen, ready, register, login, verify, resend, logout }}>{children}</Ctx.Provider>;
}

export const useCitizen = () => useContext(Ctx);

export function apiError(e) {
  const d = e.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg).join(" ");
  return e.message || "Something went wrong";
}

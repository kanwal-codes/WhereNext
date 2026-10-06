"use client";

import { createContext, useContext } from "react";

/** The visitor's nearest airport, worked out on the server from the request's location (null when unknown). */
const HomeAirportContext = createContext<string | null>(null);
export const HomeAirportProvider = HomeAirportContext.Provider;
export const useServerHomeAirport = () => useContext(HomeAirportContext);

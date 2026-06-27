"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { UiState } from "@/lib/auth/ui-state";

interface UiStateContextValue {
  uiState: UiState;
  setUiState: (state: UiState) => void;
  mergeUiState: (partial: Partial<UiState>) => void;
}

const UiStateContext = createContext<UiStateContextValue | undefined>(undefined);

export function UiStateProvider({
  initialUiState,
  children,
}: {
  initialUiState: UiState;
  children: ReactNode;
}) {
  const [uiState, setUiState] = useState<UiState>(initialUiState);

  const mergeUiState = useCallback((partial: Partial<UiState>) => {
    setUiState((prev) => ({ ...prev, ...partial }));
  }, []);

  return (
    <UiStateContext.Provider value={{ uiState, setUiState, mergeUiState }}>
      {children}
    </UiStateContext.Provider>
  );
}

export function useUiState(): UiStateContextValue {
  const context = useContext(UiStateContext);
  if (!context) {
    throw new Error("useUiState must be used within a UiStateProvider");
  }
  return context;
}

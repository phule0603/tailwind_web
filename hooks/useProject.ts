"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadProject, SaveConflict, saveProject, storageMode, type StorageMode } from "@/lib/pm/client";
import { analyzeProject } from "@/lib/pm/evm";
import type { Project } from "@/lib/pm/types";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

const AUTOSAVE_MS = 800;

/**
 * Loads one project, applies edits locally right away and autosaves them
 * (debounced). Edits made while a save is in flight are kept and saved next.
 */
export function useProject(id: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Project | null>(null);
  const [mode, setMode] = useState<StorageMode | null>(null);

  const latest = useRef<Project | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    let alive = true;
    storageMode().then((m) => alive && setMode(m));
    loadProject(id)
      .then((p) => {
        if (!alive) return;
        if (!p) setNotFound(true);
        latest.current = p;
        setProject(p);
      })
      .catch((err: Error) => alive && setLoadError(err.message));
    return () => {
      alive = false;
    };
  }, [id]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const sent = latest.current;
    if (!sent || saving.current) return;
    saving.current = true;
    setSaveState("saving");
    try {
      const saved = await saveProject(sent);
      if (latest.current === sent) {
        latest.current = saved;
        setProject(saved);
        setSaveState("saved");
      } else if (latest.current) {
        // edited meanwhile: keep the edits on top of the new version
        latest.current = { ...latest.current, version: saved.version };
        setProject(latest.current);
        timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
        setSaveState("dirty");
      }
      setSaveError(null);
    } catch (err) {
      if (err instanceof SaveConflict) {
        setConflict(err.current ?? null);
        setSaveState("conflict");
      } else {
        setSaveError((err as Error).message);
        setSaveState("error");
      }
    } finally {
      saving.current = false;
    }
  }, []);

  /** Applies an edit; `immediate` saves without the debounce. */
  const update = useCallback(
    (fn: (p: Project) => Project, immediate = false) => {
      const cur = latest.current;
      if (!cur) return;
      const next = fn(cur);
      if (next === cur) return;
      latest.current = next;
      setProject(next);
      setSaveState((s) => (s === "conflict" ? s : "dirty"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), immediate ? 0 : AUTOSAVE_MS);
    },
    [flush],
  );

  /** Conflict resolution: take the stored copy, or overwrite it with ours. */
  const resolveConflict = useCallback(
    (keep: "theirs" | "mine") => {
      const theirs = conflict;
      setConflict(null);
      if (!theirs) {
        setSaveState("error");
        return;
      }
      if (keep === "theirs") {
        latest.current = theirs;
        setProject(theirs);
        setSaveState("saved");
      } else if (latest.current) {
        latest.current = { ...latest.current, version: theirs.version };
        setSaveState("dirty");
        void flush();
      }
    },
    [conflict, flush],
  );

  // warn before leaving with unsaved edits
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (saveState !== "saved") e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [saveState]);

  const analysis = useMemo(() => (project ? analyzeProject(project) : null), [project]);

  return {
    project,
    analysis,
    loadError,
    notFound,
    mode,
    saveState,
    saveError,
    conflict,
    update,
    retrySave: flush,
    resolveConflict,
  };
}

export type ProjectHandle = ReturnType<typeof useProject>;

import React from "react";
import { useEnvironment } from "@react-three/drei";
import { ENVS } from "../constants/environments";

function PreloadEnv({ url }) {
  // Use the same hook that <Environment /> uses internally to ensure cache hit
  useEnvironment({ files: url });
  return null;
}

export function EnvironmentPreloader() {
  return (
    <>
      {Object.values(ENVS).map((url) => (
        <PreloadEnv key={url} url={url} />
      ))}
    </>
  );
}

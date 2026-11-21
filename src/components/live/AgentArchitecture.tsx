"use client";

import { useState } from "react";
import type { Graph } from "@/lib/catalogue/types";
import { WorkflowGraph } from "@/components/product/WorkflowGraph";

/** Interactive schematic for the Agent architecture section of a live product page. */
export function AgentArchitecture({ graph }: { graph: Graph }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <WorkflowGraph graph={graph} events={[]} selectedNode={selected} onSelectNode={setSelected} focusEventNode={null} />;
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import axios from "axios";

export default function RAGApp() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");

  const fetchRAGResponse = async () => {
    if (!query) return;
    try {
      const res = await axios.post("/api/query", { query });
      setResponse(res.data.response);
    } catch (error) {
      console.error("Error fetching response", error);
    }
  };

  return (
    <div className="flex flex-col items-center p-6 min-h-screen bg-gray-100">
      <Card className="w-full max-w-md shadow-md">
        <CardContent className="p-6">
          <Input
            placeholder="Enter your query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-4"
          />
          <Button onClick={fetchRAGResponse} className="w-full">Submit</Button>
          {response && (
            <div className="mt-4 p-4 border rounded-md bg-white shadow-sm">
              {response}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
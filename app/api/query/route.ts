import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { Pool } from "pg";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

// 環境變數
const openaiApiKey = process.env.OPENAI_API_KEY!;
const dbUrl = process.env.DATABASE_URL!;

console.log("Database URL:", process.env.DATABASE_URL);



// 初始化 PostgreSQL 連線池
const pool = new Pool({ connectionString: dbUrl });

// 初始化 OpenAI Embeddings
const embeddings = new OpenAIEmbeddings({ openAIApiKey: openaiApiKey });

// 設置 PGVector 存儲
const vectorStore = new PGVectorStore(embeddings, {
    pool,
    tableName: "vectors",
});

// API 路由處理
export async function POST(req: NextRequest) {
    try {
        const { query } = await req.json();
        if (!query) {
            return NextResponse.json({ error: "Query is required" }, { status: 400 });
        }
        const searchQuery = `${query}`;
        // 在向量存儲中查找相關文檔
        const relevantDocs = await vectorStore.similaritySearch(searchQuery, 5, { similarityThreshold: 0.5 });

        console.log("Executing similarity search for:", searchQuery);
        console.log("Relevant documents found:", relevantDocs.length);
        console.log("Relevant Documents Found:", JSON.stringify(relevantDocs, null, 2));



        let responseText = "";
        let source = "RAG";

        if (relevantDocs.length > 0) {
            // 若找到相關內容，則使用 RAG 生成回答
            const model = new ChatOpenAI({ openAIApiKey: openaiApiKey });
            const messages = [
                new SystemMessage("You are a helpful assistant."),
                new HumanMessage(query),
                new AIMessage(relevantDocs.map((d) => d.pageContent).join("\n")),
            ];
            const response = await model.invoke(messages);
            responseText = response?.content?.toString() ?? "No response available.";
        } else {
            // 若無相關內容，則讓 OpenAI 直接回答，並標註為 AI 生成
            source = "OpenAI";
            const model = new ChatOpenAI({ openAIApiKey: openaiApiKey });
            const response = await model.invoke([new HumanMessage(query)]);
            responseText = "[generated without RAG] " + (response?.content?.toString() ?? "No response available.");
        }

        console.log("Response Source:", source); // 確保 source 被記錄
        return NextResponse.json({ response: responseText, source });
    } catch (error) {
        console.error("Error generating response:", error);
        return NextResponse.json({ error: "Error processing request" }, { status: 500 });
    }
}

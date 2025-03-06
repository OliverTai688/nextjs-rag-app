import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { Pool } from "pg";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Document } from "@langchain/core/documents";

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

        console.log("Executing vector similarity search for query:", query);

        // SQL 查詢：使用 pgvector 查找最相似的 5 筆資料
        const sql = `
            SELECT id, content, embedding <=> (
                SELECT embedding FROM vectors WHERE content LIKE $1 LIMIT 1
            ) AS similarity
            FROM vectors
            ORDER BY similarity
            LIMIT 5;
        `;
        const values = [`%${query}%`]; // 避免 SQL 注入
        const result = await pool.query(sql, values);

        console.log("Found", result.rows.length, "similar documents");

        let relevantDocs: [Document<Record<string, any>>, number][] = result.rows.map(
            (row: { id: number; content: string; similarity: number }) => [
                new Document({
                    pageContent: row.content,
                    metadata: { id: row.id }
                }),
                row.similarity
            ]
        );

        // **若查詢結果不足 5 筆，改用 `similaritySearchVectorWithScore()` 作為備援**
        if (relevantDocs.length < 5) {
            console.log(`Only found ${relevantDocs.length}, using fallback vector search...`);

            const queryEmbedding = await embeddings.embedQuery(query);
            const fallbackDocs = await vectorStore.similaritySearchVectorWithScore(queryEmbedding, 10, { similarityThreshold: 0.1 });

            // 取 `fallbackDocs` 補足不足的數據
            const additionalDocsNeeded = 5 - relevantDocs.length;
            relevantDocs = relevantDocs.concat(fallbackDocs.slice(0, additionalDocsNeeded));
        }

        // **確保返回 5 筆資料**
        relevantDocs = relevantDocs.slice(0, 5);

        console.log("Final relevant documents:", JSON.stringify(relevantDocs, null, 2));

        let responseText = "";
        let source = "RAG";

        if (relevantDocs.length > 0) {
            // **修正 `pageContent` 讀取方式**（從 [Document, number] 取值）
            const context = relevantDocs.map(([doc]) => doc.pageContent).join("\n");

            // 若找到相關內容，則使用 RAG 生成回答
            const model = new ChatOpenAI({ openAIApiKey: openaiApiKey });
            const messages = [
                new SystemMessage("You are a helpful assistant."),
                new HumanMessage(query),
                new AIMessage(context),
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

        console.log("Response Source:", source);
        return NextResponse.json({ response: responseText, source, relevantDocs });
    } catch (error) {
        console.error("Error processing request:", error);
        return NextResponse.json({ error: "Error processing request" }, { status: 500 });
    }
}

import { createClient } from "@supabase/supabase-js";
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai"; // 引入 ChatOpenAI 來做標籤分類
import "dotenv/config";

// 連接 Supabase
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const embeddings = new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY! });
const chatModel = new ChatOpenAI({ openAIApiKey: process.env.OPENAI_API_KEY! });

async function generateTags(content: string): Promise<string[]> {
    const prompt = `
    Analyze the following course description and generate 3-5 relevant tags. 
    Tags should be concise, relevant, and useful for categorization.

    Course Description: "${content}"

    Output only a JSON array of tags, like this:
    ["AI", "Machine Learning", "Programming"]
    `;

    const response = await chatModel.invoke(prompt);
    
    try {
        const tags = JSON.parse(response.content.toString());
        return Array.isArray(tags) ? tags : [];
    } catch (error) {
        console.error("Error parsing tags:", error);
        return [];
    }
}

async function insertEmbeddings() {
    const { data, error } = await supabase.from("vectors").select("id, content");
    if (error) {
        console.error("Error fetching data:", error);
        return;
    }

    for (const row of data) {
        // 生成嵌入向量
        const embedding = await embeddings.embedQuery(row.content);
        
        // 自動生成 metadata 標籤
        const tags = await generateTags(row.content);
        
        // 更新資料庫
        const { error: updateError } = await supabase
            .from("vectors")
            .update({ embedding, metadata: { tags } }) // 將 tags 存入 metadata
            .eq("id", row.id);

        if (updateError) {
            console.error(`Error updating embedding for id ${row.id}:`, updateError);
        }
    }

    console.log("Embeddings with metadata inserted successfully!");
}

insertEmbeddings();

import { NextResponse } from "next/server";

export async function POST(req: Request) {

  const { messages, context } = await req.json();

  const response = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`
    },
    body:JSON.stringify({
      model:"gpt-4.1-mini",
      messages:[
        {
          role:"system",
          content:`Du bist ein veterinärmedizinischer Assistent und unterstützt Tierärzte bei der Diskussion von Behandlungsfällen.

Aktueller Bericht:

${context}

Nutze diesen Bericht als Kontext für alle Antworten.`
        },
        ...messages
      ]
    })
  });

  if(!response.ok){
    const error = await response.text();
    return NextResponse.json({error},{status:500});
  }

  const data = await response.json();

  return NextResponse.json({
    answer:data.choices[0].message.content
  });

}

import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.21.0'

Deno.serve(async (req) => {
  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not found' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const result = await model.generateContent('Say hello!')
    const text = result.response.text()

    return new Response(
      JSON.stringify({
        success: true,
        message: text,
        hasKey: !!geminiApiKey
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

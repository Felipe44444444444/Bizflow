import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { client_id, signature_data } = await req.json();

  if (!client_id || !signature_data) {
    return NextResponse.json({ error: "Missing client_id or signature_data" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await supabase
    .from("clients")
    .update({
      contract_signed: true,
      signature_data,
      signed_at: new Date().toISOString(),
    })
    .eq("id", client_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("activity_log").insert({
    client_id,
    action: "Contrato firmado digitalmente",
    details: "Firma digital registrada desde el portal de cliente",
  });

  return NextResponse.json({ success: true });
}

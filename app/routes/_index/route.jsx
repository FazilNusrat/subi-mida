import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  if (shop) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  
  throw redirect("/app");
};
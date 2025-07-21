import dynamic from "next/dynamic";

export default dynamic(() => import("./client"), {
  ssr: false,
});

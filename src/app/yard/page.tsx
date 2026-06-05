import dynamic from "next/dynamic";

const MountingYardApp = dynamic(() => import("@/components/mounting-yard-app"), {
  ssr: false,
});

export default function YardPage() {
  return <MountingYardApp />;
}

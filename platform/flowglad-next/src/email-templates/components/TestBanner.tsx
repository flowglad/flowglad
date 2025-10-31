
export default function TestModeBanner(livemode: boolean) {

  if (livemode) return null;

  return livemode ? null : (
    <div className="bg-yellow-500 text-black text-center p-2 font-bold">
      TEST MODE ENABLED
    </div>
  );
}
import { FlashcardApp } from '@/components/FlashcardApp';
import { HskCategoryList } from '@/components/HskCategoryList';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-indigo-50 to-rose-100 py-6 sm:py-10">
      <FlashcardApp />
      <HskCategoryList />
    </main>
  );
}

import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { SettingsProvider } from './store/settings'
import Bookshelf from './pages/Bookshelf'
import Reader from './pages/Reader'

const router = createBrowserRouter([
  { path: '/', element: <Bookshelf /> },
  { path: '/book/:bookId', element: <Reader /> },
])

function Inner() {
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {})
  }, [])

  return <RouterProvider router={router} />
}

export default function App() {
  return (
    <SettingsProvider>
      <Inner />
    </SettingsProvider>
  )
}

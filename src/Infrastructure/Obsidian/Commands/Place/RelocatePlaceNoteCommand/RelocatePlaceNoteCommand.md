# Relocatete Note Command

Este comando se utiliza para mover la nota de un lugar a la carpeta correspondiente en base a la información del frontmatter.

## ¿Cómo funciona?

1.  **Busca en el Frontmatter**: El comando lee las propiedades (frontmatter) de la nota que tienes abierta.
2.  **Identifica el destino**: En base a la información del frontmatter, identifica el destino.

## Estructura de Carpetas Generada

El comando intenta crear una estructura lógica:
`[Carpeta Raíz de Lugares] / [Continente] / [País] / [Región/Comunidad] / [Provincia] / [Municipio] / Nota.md`

Si es un País:
`[Carpeta Raíz de Lugares] / [Continente] / [País] / [País].md`

Si es una Region/Comunidad:
`[Carpeta Raíz de Lugares] / [Continente] / [País] / [Región/Comunidad] / [Región/Comunidad].md`

Si es una Provincia:
`[Carpeta Raíz de Lugares] / [Continente] / [País] / [Región/Comunidad] / [Provincia] / [Provincia].md`

Si es un Municipio:
`[Carpeta Raíz de Lugares] / [Continente] / [País] / [Región/Comunidad] / [Provincia] / [Municipio] / [Municipio].md`

Si es una ciudad que el nombre coincide con el nivel superior, añade '(Ciudad)' al final:
`Lugares/Europa/España/Comunidad de Madrid/Madrid/Madrid (Ciudad)/Madrid (Ciudad).md`